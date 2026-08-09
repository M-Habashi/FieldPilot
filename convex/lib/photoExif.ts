import * as exifr from 'exifr';

export interface ExifPhotoLocation {
  latitude: number;
  longitude: number;
}

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

export async function extractExifPhotoLocation(
  file: Blob | ArrayBuffer,
): Promise<ExifPhotoLocation | null> {
  try {
    const bytes = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const gps = await exifr.gps(bytes);
    if (!gps || !isValidLocation(gps.latitude, gps.longitude)) return null;
    return { latitude: gps.latitude, longitude: gps.longitude };
  } catch {
    return null;
  }
}
