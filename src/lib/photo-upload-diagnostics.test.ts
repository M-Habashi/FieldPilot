import { describe, expect, it } from 'vitest';
import {
  photoUploadErrorDiagnostics,
  photoUploadFileDiagnostics,
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
});
