import * as exifr from 'exifr';

export interface PhotoLocation {
  latitude: number;
  longitude: number;
}

export interface ExtractedPhotoLocation extends PhotoLocation {
  source: 'exif';
  originalLatitude: number;
  originalLongitude: number;
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

/** Reads GPS from an original JPEG or HEIC without uploading the image first. */
export async function extractPhotoLocation(file: Blob): Promise<ExtractedPhotoLocation | null> {
  try {
    const gps = await exifr.gps(file);
    if (!gps || !isValidLocation(gps.latitude, gps.longitude)) return null;
    return {
      latitude: gps.latitude,
      longitude: gps.longitude,
      source: 'exif',
      originalLatitude: gps.latitude,
      originalLongitude: gps.longitude,
    };
  } catch {
    return null;
  }
}
