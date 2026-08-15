import { describe, expect, it, vi } from 'vitest';
import {
  isPhotoPickerCancellation,
  pickAndroidDocumentPhotos,
  supportsAndroidDocumentPhotoPicker,
} from './android-photo-picker';

function pickerWindow(
  userAgent: string,
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
  }) => Promise<Array<{ getFile(): Promise<File> }>>,
) {
  return {
    navigator: { userAgent },
    showOpenFilePicker,
  } as unknown as Window;
}

describe('Android document photo picker', () => {
  it('is limited to Android browsers with the File System Access picker', () => {
    const picker = vi.fn(async () => [] as never[]);

    expect(supportsAndroidDocumentPhotoPicker(pickerWindow('Android 16', picker))).toBe(true);
    expect(supportsAndroidDocumentPhotoPicker(pickerWindow('iPhone', picker))).toBe(false);
    expect(supportsAndroidDocumentPhotoPicker(pickerWindow('Android 16'))).toBe(false);
  });

  it('uses an unfiltered multi-file document picker and returns its files unchanged', async () => {
    const first = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const second = new File(['second'], 'second.heic', { type: 'image/heic' });
    const picker = vi.fn(async () => [
      { getFile: async () => first },
      { getFile: async () => second },
    ]);
    const target = pickerWindow('Mozilla/5.0 (Linux; Android 16)', picker);

    await expect(pickAndroidDocumentPhotos(target)).resolves.toEqual([first, second]);
    expect(picker).toHaveBeenCalledWith({ multiple: true });
  });

  it('recognizes a user-cancelled picker without hiding other failures', () => {
    expect(isPhotoPickerCancellation({ name: 'AbortError' })).toBe(true);
    expect(isPhotoPickerCancellation(new Error('failed'))).toBe(false);
  });
});
