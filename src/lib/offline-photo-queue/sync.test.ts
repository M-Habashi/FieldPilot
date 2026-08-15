import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadPhotoForm } from '../photo-upload-transport';
import { deleteOfflinePhotoQueueDatabaseForTests } from './db';
import {
  enqueueMaterializedPhoto,
  listQueuedPhotoUploads,
  subscribeOfflinePhotoUploadCompletions,
} from './queue';
import { processOfflinePhotoQueue } from './sync';

vi.mock('../photo-upload-transport', () => ({
  uploadPhotoForm: vi.fn(),
}));

const mockedUploadPhotoForm = vi.mocked(uploadPhotoForm);

async function enqueue() {
  const file = new File([new Uint8Array([0xff, 0xd8, 0x00, 0xff, 0xd9])], 'photo.jpg', {
    type: 'image/jpeg',
    lastModified: 42,
  });
  await enqueueMaterializedPhoto({
    clientUploadId: 'upload-1',
    projectId: 'project-a',
    userId: 'user-a',
    file,
    contentType: file.type,
    clientDiagnostics: { attemptId: 'upload-1', size: file.size, stage: 'selection' },
  });
}

beforeEach(async () => {
  mockedUploadPhotoForm.mockReset();
  await deleteOfflinePhotoQueueDatabaseForTests();
});

afterEach(async () => {
  await deleteOfflinePhotoQueueDatabaseForTests();
});

describe('offline photo queue sync', () => {
  it('uploads a reconstructed file and removes the completed queue item', async () => {
    await enqueue();
    mockedUploadPhotoForm.mockResolvedValue({
      ok: true,
      status: 200,
      body: JSON.stringify({
        attachmentId: 'attachment-1',
        hasExifLocation: true,
        exifStatus: 'found',
      }),
    });
    const completions: string[] = [];
    const unsubscribe = subscribeOfflinePhotoUploadCompletions((completion) => {
      completions.push(completion.attachmentId);
    });

    await expect(
      processOfflinePhotoQueue({ userId: 'user-a', authToken: 'token' }),
    ).resolves.toEqual({ uploaded: 1, failed: 0 });

    unsubscribe();
    expect(await listQueuedPhotoUploads('user-a')).toEqual([]);
    expect(completions).toEqual(['attachment-1']);
    const form = mockedUploadPhotoForm.mock.calls[0]?.[2];
    expect(form?.get('clientUploadId')).toBe('upload-1');
    const uploadedFile = form?.get('photo');
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile).toMatchObject({ name: 'photo.jpg', type: 'image/jpeg', lastModified: 42 });
  });

  it('pauses authentication failures without discarding the photo', async () => {
    await enqueue();
    mockedUploadPhotoForm.mockResolvedValue({ ok: false, status: 401, body: '{}' });

    await processOfflinePhotoQueue({ userId: 'user-a', authToken: 'expired' });

    expect(await listQueuedPhotoUploads('user-a')).toMatchObject([
      {
        clientUploadId: 'upload-1',
        status: 'failed',
        failureKind: 'auth',
        retryCount: 1,
      },
    ]);
  });

  it('schedules retryable server failures and keeps the bytes', async () => {
    await enqueue();
    mockedUploadPhotoForm.mockResolvedValue({ ok: false, status: 503, body: '{}' });

    await processOfflinePhotoQueue({ userId: 'user-a', authToken: 'token' });

    const [failed] = await listQueuedPhotoUploads('user-a');
    expect(failed).toMatchObject({
      status: 'failed',
      failureKind: 'server',
      retryCount: 1,
    });
    expect(failed.nextAttemptAt).toBeGreaterThan(Date.now());
    expect(failed.blob.size).toBeGreaterThan(0);
  });
});
