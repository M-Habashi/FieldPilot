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
