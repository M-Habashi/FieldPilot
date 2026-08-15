interface FileSystemPhotoHandle {
  getFile(): Promise<File>;
}

interface AndroidPhotoPickerWindow extends Window {
  showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<FileSystemPhotoHandle[]>;
}

export function supportsAndroidDocumentPhotoPicker(
  target: Window = window,
): target is AndroidPhotoPickerWindow {
  const candidate = target as AndroidPhotoPickerWindow;
  return (
    /Android/i.test(target.navigator.userAgent) &&
    typeof candidate.showOpenFilePicker === 'function'
  );
}

export async function pickAndroidDocumentPhotos(target: Window = window): Promise<File[]> {
  const picker = (target as AndroidPhotoPickerWindow).showOpenFilePicker;
  if (!supportsAndroidDocumentPhotoPicker(target) || !picker) {
    throw new Error('The Android document photo picker is not available.');
  }

  // Chromium maps the File System Access picker to ACTION_OPEN_DOCUMENT on
  // Android. Do not add an image MIME filter here: Android can intercept a
  // media-filtered intent with the privacy-redacting system photo picker.
  const handles = await picker.call(target, { multiple: true });
  return Promise.all(handles.map((handle) => handle.getFile()));
}

export function isPhotoPickerCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}
