import { describe, expect, it } from 'vitest';
import {
  photoUploadErrorDiagnostics,
  photoUploadFileDiagnostics,
  inspectSelectedPhotoBytes,
} from './photo-upload-diagnostics';

describe('photo upload diagnostics', () => {
  it('records useful picker metadata without retaining a complete filename', () => {
    const file = new File(['image'], '1000000016.JPG', {
      type: 'image/jpeg',
      lastModified: 1_000,
    });

    expect(photoUploadFileDiagnostics(file, 4_000)).toEqual({
      contentType: 'image/jpeg',
      extension: 'jpg',
      size: 5,
      fileNamePattern: 'numeric',
      lastModifiedAgeMs: 3_000,
    });
  });

  it('bounds error details before they leave the browser', () => {
    const result = photoUploadErrorDiagnostics(new Error('x'.repeat(500)));
    expect(result.errorName).toBe('Error');
    expect(result.errorMessage).toHaveLength(240);
  });

  it('creates a stable privacy-safe fingerprint for selected bytes', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const first = new File([jpeg], 'first.jpg', { type: 'image/jpeg' });
    const second = new File([jpeg], 'second.jpg', { type: 'image/jpeg' });

    const [firstInspection, secondInspection] = await Promise.all([
      inspectSelectedPhotoBytes(first),
      inspectSelectedPhotoBytes(second),
    ]);

    expect(firstInspection.byteFingerprint).toHaveLength(24);
    expect(firstInspection.byteFingerprint).toBe(secondInspection.byteFingerprint);
    expect(firstInspection.exifStatus).toBe('missing');
  });
});
