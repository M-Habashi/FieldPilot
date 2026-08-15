import exifr from 'exifr';
import { enableExtendedHeicRecognition } from '../../src/lib/exifr-heic-compat';

enableExtendedHeicRecognition(exifr);

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

function quickTimeLocation(bytes: ArrayBuffer): ExifPhotoLocation | null {
  const data = new Uint8Array(bytes);
  const view = new DataView(bytes);

  // Samsung Motion Photos append an MP4 to the JPEG. Android may redact the
  // JPEG GPS IFD while leaving the MP4's ISO 6709 `©xyz` location atom intact.
  for (let typeOffset = 4; typeOffset <= data.length - 4; typeOffset += 1) {
    if (
      data[typeOffset] !== 0xa9 ||
      data[typeOffset + 1] !== 0x78 ||
      data[typeOffset + 2] !== 0x79 ||
      data[typeOffset + 3] !== 0x7a
    ) {
      continue;
    }

    const atomStart = typeOffset - 4;
    const atomSize = view.getUint32(atomStart, false);
    const atomEnd = atomStart + atomSize;
    if (atomSize < 12 || atomEnd > data.length) continue;

    const payload = data.subarray(typeOffset + 4, atomEnd);
    for (let start = 0; start < payload.length - 1; start += 1) {
      const sign = payload[start];
      if (
        (sign !== 0x2b && sign !== 0x2d) ||
        payload[start + 1] < 0x30 ||
        payload[start + 1] > 0x39
      ) {
        continue;
      }
      let end = start;
      while (
        end < payload.length &&
        end - start <= 128 &&
        payload[end] !== 0x2f &&
        payload[end] !== 0
      ) {
        end += 1;
      }
      if (end - start > 128) continue;
      if (end < payload.length && payload[end] === 0x2f) end += 1;
      const value = String.fromCharCode(...payload.subarray(start, end));
      const match = /^([+-]\d{2}(?:\.\d+)?)([+-]\d{3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\/?$/u.exec(
        value,
      );
      if (!match) continue;
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (isValidLocation(latitude, longitude)) return { latitude, longitude };
    }
  }
  return null;
}

export async function inspectExifPhotoLocation(
  file: Blob | ArrayBuffer,
): Promise<ExifPhotoInspection> {
  const bytes = file instanceof ArrayBuffer ? file : await file.arrayBuffer().catch(() => null);
  if (bytes === null) return { status: 'unreadable' };
  let exifUnreadable = false;
  try {
    const gps = await exifr.gps(bytes);
    if (gps && isValidLocation(gps.latitude, gps.longitude)) {
      return {
        status: 'found',
        location: { latitude: gps.latitude, longitude: gps.longitude },
      };
    }
  } catch {
    exifUnreadable = true;
  }

  const motionPhotoLocation = quickTimeLocation(bytes);
  if (motionPhotoLocation) return { status: 'found', location: motionPhotoLocation };
  return { status: exifUnreadable ? 'unreadable' : 'missing' };
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
