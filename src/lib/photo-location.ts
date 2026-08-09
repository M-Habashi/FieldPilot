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

/** Reads GPS from the selected file's bytes before uploading the image. */
export async function extractPhotoLocation(file: Blob): Promise<ExtractedPhotoLocation | null> {
  try {
    // Give exifr a browser File directly, matching GeoLibre's importer. This
    // avoids buffering a second full copy of a phone photo before parsing it.
    // Plain Blobs still need bytes in non-browser callers such as unit tests.
    const source = typeof File === 'function' && file instanceof File ? file : await file.arrayBuffer();
    const gps = await exifr.gps(source);
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
