import * as exifr from 'exifr';

export interface ExifPhotoLocation {
  latitude: number;
  longitude: number;
}

export type ExifPhotoInspection =
  | { status: 'found'; location: ExifPhotoLocation }
  | { status: 'missing' }
  | { status: 'unreadable' };

function isValidLocation(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export async function inspectExifPhotoLocation(
  file: Blob | ArrayBuffer,
): Promise<ExifPhotoInspection> {
  try {
    const bytes = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const gps = await exifr.gps(bytes);
    if (!gps || !isValidLocation(gps.latitude, gps.longitude)) return { status: 'missing' };
    return {
      status: 'found',
      location: { latitude: gps.latitude, longitude: gps.longitude },
    };
  } catch {
    return { status: 'unreadable' };
  }
}

export async function extractExifPhotoLocation(
  file: Blob | ArrayBuffer,
): Promise<ExifPhotoLocation | null> {
  const inspection = await inspectExifPhotoLocation(file);
  return inspection.status === 'found' ? inspection.location : null;
}

export async function photoByteFingerprint(file: Blob | ArrayBuffer): Promise<string> {
  const bytes = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
