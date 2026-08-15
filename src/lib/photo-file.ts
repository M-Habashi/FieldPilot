const photoTypeByExtension: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jfif: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
};

const androidPhotoPickerAccept = 'image/*,text/plain';

/**
 * Android's media-only picker returns an EXIF-redacted copy of gallery photos,
 * with the GPS rationals replaced by zeroes. Including one non-image MIME type
 * makes Chromium use its generic document route instead. Validation still
 * rejects non-images after selection. Other platforms keep the existing,
 * unrestricted picker contract.
 */
export function photoPickerAccept(isAndroid: boolean): string {
  return isAndroid ? androidPhotoPickerAccept : '';
}

/**
 * Browsers and native pickers do not consistently provide a MIME type for
 * photos. In particular, iPhone HEIC/HEIF selections can arrive with an empty
 * type or `application/octet-stream`, so fall back to the filename extension.
 */
export function photoContentType(file: Pick<File, 'name' | 'type'>): string | null {
  const browserType = file.type.trim().toLowerCase();
  if (browserType.startsWith('image/')) return browserType;

  const extension = file.name.split('.').pop()?.trim().toLowerCase();
  if (!extension || extension === file.name.toLowerCase()) return null;
  return photoTypeByExtension[extension] ?? null;
}
