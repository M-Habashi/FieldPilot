import { afterEach, describe, expect, it, vi } from 'vitest';
import { materializePhotoUploadFile, photoFileFromDataUrl } from './photo-upload-transport';

afterEach(() => vi.unstubAllGlobals());

describe('photo upload transport', () => {
  it('materializes picker files through FileReader.readAsDataURL', async () => {
    const readAsDataUrl = vi.fn(function (this: { onload: (() => void) | null }, file: Blob) {
      void file.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        const encoded = btoa(String.fromCharCode(...bytes));
        Object.assign(this, { result: `data:${file.type};base64,${encoded}` });
        this.onload?.();
      });
    });
    class FileReaderStub {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      readAsDataURL = readAsDataUrl;
    }
    vi.stubGlobal('FileReader', FileReaderStub);
    const source = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xd9])], 'camera.jpg', {
      type: 'image/jpeg',
      lastModified: 1234,
    });

    const file = await materializePhotoUploadFile(source, 'image/jpeg');

    expect(readAsDataUrl).toHaveBeenCalledOnce();
    expect(readAsDataUrl).toHaveBeenCalledWith(source);
    expect(file).not.toBe(source);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array(await source.arrayBuffer()),
    );
  });

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
