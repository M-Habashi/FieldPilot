import { describe, expect, it } from 'vitest';
import { photoContentType, photoPickerAccept } from './photo-file';

describe('photoPickerAccept', () => {
  it('forces Android gallery uploads through the generic document picker', () => {
    expect(photoPickerAccept(true)).toBe('image/*,text/plain');
  });

  it('does not change the picker contract on other platforms', () => {
    expect(photoPickerAccept(false)).toBe('');
  });
});

describe('photoContentType', () => {
  it('preserves browser-provided image MIME types', () => {
    expect(photoContentType({ name: 'photo', type: 'image/heic' })).toBe('image/heic');
    expect(photoContentType({ name: 'photo.jpg', type: 'IMAGE/JPEG' })).toBe('image/jpeg');
  });

  it('recognizes iPhone photos when the picker omits their MIME type', () => {
    expect(photoContentType({ name: 'IMG_2048.HEIC', type: '' })).toBe('image/heic');
    expect(photoContentType({ name: 'IMG_2049.heif', type: 'application/octet-stream' })).toBe(
      'image/heif',
    );
  });

  it('recognizes common photo extensions with a generic MIME type', () => {
    expect(photoContentType({ name: 'site-photo.JPEG', type: '' })).toBe('image/jpeg');
    expect(photoContentType({ name: 'markup.png', type: 'application/octet-stream' })).toBe(
      'image/png',
    );
  });

  it('rejects files with neither an image MIME type nor a photo extension', () => {
    expect(photoContentType({ name: 'notes.pdf', type: 'application/pdf' })).toBeNull();
    expect(photoContentType({ name: 'untitled', type: '' })).toBeNull();
  });
});
