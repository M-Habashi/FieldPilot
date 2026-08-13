import { describe, expect, it } from 'vitest';
import { photoFileFromDataUrl } from './photo-upload-transport';

describe('photo upload transport', () => {
  it('materializes the FileReader data URL as an owned file without changing bytes', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0xff, 0xd9]);
    const encoded = btoa(String.fromCharCode(...bytes));
    const file = photoFileFromDataUrl(
      `data:image/jpeg;base64,${encoded}`,
      { name: 'camera.jpg', lastModified: 1234 },
      'image/jpeg',
    );

    expect(file.name).toBe('camera.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.lastModified).toBe(1234);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it('uses the validated fallback type for an untyped picker file', () => {
    const file = photoFileFromDataUrl(
      'data:application/octet-stream;base64,/9j/2Q==',
      { name: 'camera.jpg', lastModified: 0 },
      'image/jpeg',
    );

    expect(file.type).toBe('image/jpeg');
  });

  it('rejects a non-base64 FileReader result', () => {
    expect(() =>
      photoFileFromDataUrl(
        'data:image/jpeg,not-base64',
        { name: 'camera.jpg', lastModified: 0 },
        'image/jpeg',
      ),
    ).toThrow('unsupported format');
  });
});
