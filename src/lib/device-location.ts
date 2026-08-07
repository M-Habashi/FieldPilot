import type { PhotoLocation } from './photo-location';

export interface DeviceLocation extends PhotoLocation {
  /** Radius of the 68% confidence circle, in metres, as reported by the browser. */
  accuracy: number;
}

/**
 * A photo older than this gets no suggestion. The device only knows where the
 * *uploader* is now, so it stands in for where the camera was only while the
 * two are still the same place — shoot a floor in the morning and upload at
 * lunch and the suggestion would be the site trailer.
 */
export const PHOTO_FRESHNESS_WINDOW_MS = 10 * 60 * 1000;

/**
 * Indoors and inside steel frames a phone falls back to wifi/cell positioning
 * and reports hundreds of metres to kilometres. A pin that vague reads as
 * authoritative while being useless, so it is worse than an honest "unmapped".
 * Desktop uploads are typically wifi-derived and fail this too, which is why
 * the upload path needs no separate desktop case.
 */
export const DEVICE_LOCATION_MAX_ACCURACY_M = 100;

const GEOLOCATION_TIMEOUT_MS = 10_000;

/** A photo with no capture time is treated as stale — we cannot prove it is not. */
export function isPhotoFreshEnough(takenAt: number | null, now: number): boolean {
  if (takenAt === null) return false;
  const age = now - takenAt;
  // Clock skew between camera and browser can put a fresh photo slightly in the
  // future; allow that but not an arbitrarily post-dated timestamp.
  return age <= PHOTO_FRESHNESS_WINDOW_MS && age >= -PHOTO_FRESHNESS_WINDOW_MS;
}

export function isUsableDeviceLocation(location: DeviceLocation): boolean {
  return Number.isFinite(location.accuracy) && location.accuracy <= DEVICE_LOCATION_MAX_ACCURACY_M;
}

export type DeviceLocationResult =
  | { status: 'ok'; location: DeviceLocation }
  | { status: 'unsupported' }
  | { status: 'failed'; code: number };

/**
 * Never rejects: every failure path — no support, denied permission, timeout,
 * position unavailable — comes back as a result the caller treats exactly like
 * a missing EXIF location, so a denied prompt costs the user nothing. The
 * failure reason is preserved only so `describeSuggestionOutcome` can report
 * it during on-device testing.
 */
export async function readDeviceLocation(): Promise<DeviceLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { status: 'unsupported' };
  }
  return await new Promise<DeviceLocationResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          status: 'ok',
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
        }),
      (error) => resolve({ status: 'failed', code: error.code }),
      {
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        // A fix from the last minute is close enough and saves waiting on the
        // GPS radio for every batch.
        maximumAge: 60_000,
      },
    );
  });
}

/**
 * Why a photo did or did not get a suggestion, in one short phrase. All four
 * rejection paths look identical to the user ("needs a location"), which makes
 * an on-device test inconclusive — especially on iOS from a Windows machine,
 * where there is no console to inspect. Surfaced in dev builds only.
 */
export function describeSuggestionOutcome(input: {
  takenAt: number | null;
  now: number;
  device: DeviceLocationResult | null;
}): string {
  if (input.takenAt === null) return 'no capture time in EXIF';
  if (!isPhotoFreshEnough(input.takenAt, input.now)) {
    const minutes = Math.round((input.now - input.takenAt) / 60_000);
    return `photo ${minutes} min old`;
  }
  if (input.device === null) return 'device location not attempted';
  if (input.device.status === 'unsupported') return 'geolocation unavailable — needs HTTPS';
  if (input.device.status === 'failed') {
    if (input.device.code === 1) return 'location denied (or insecure origin)';
    if (input.device.code === 2) return 'position unavailable';
    if (input.device.code === 3) return 'location timed out';
    return `location error ${input.device.code}`;
  }
  const accuracy = Math.round(input.device.location.accuracy);
  if (!isUsableDeviceLocation(input.device.location)) {
    return `accuracy ${accuracy} m > ${DEVICE_LOCATION_MAX_ACCURACY_M} m`;
  }
  return `suggested (accuracy ${accuracy} m)`;
}
