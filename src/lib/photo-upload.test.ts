import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadPhotoFile } from './photo-upload';

type RequestMode = 'success' | 'http-error' | 'timeout';

class FakeXMLHttpRequest {
  static mode: RequestMode = 'success';

  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  status = 200;
  responseText = JSON.stringify({ storageId: 'storage-123' });
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open() {}
  setRequestHeader() {}

  send() {
    if (FakeXMLHttpRequest.mode === 'timeout') {
      this.ontimeout?.();
      return;
    }
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
    if (FakeXMLHttpRequest.mode === 'http-error') this.status = 413;
    this.onload?.();
  }
}

const photo = new Blob(['phone photo'], { type: 'image/jpeg' }) as File;

describe('uploadPhotoFile', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.mode = 'success';
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reports progress and returns the stored file ID', async () => {
    const progress: number[] = [];
    await expect(
      uploadPhotoFile({
        uploadUrl: 'https://uploads.example.test/photo',
        file: photo,
        contentType: 'image/jpeg',
        onProgress: (percent) => progress.push(percent),
      }),
    ).resolves.toEqual({ storageId: 'storage-123' });
    expect(progress).toEqual([50, 100]);
  });

  it('reports the upload server status', async () => {
    FakeXMLHttpRequest.mode = 'http-error';
    await expect(
      uploadPhotoFile({
        uploadUrl: 'https://uploads.example.test/photo',
        file: photo,
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow('HTTP 413');
  });

  it('stops an upload that exceeds the time limit', async () => {
    FakeXMLHttpRequest.mode = 'timeout';
    await expect(
      uploadPhotoFile({
        uploadUrl: 'https://uploads.example.test/photo',
        file: photo,
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow('longer than 60 seconds');
  });
});
