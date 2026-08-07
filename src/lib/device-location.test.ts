import { describe, expect, it } from 'vitest';
import {
  DEVICE_LOCATION_MAX_ACCURACY_M,
  PHOTO_FRESHNESS_WINDOW_MS,
  describeSuggestionOutcome,
  isPhotoFreshEnough,
  isUsableDeviceLocation,
} from './device-location';

const now = 1_700_000_000_000;

describe('isPhotoFreshEnough', () => {
  it('accepts a photo taken moments ago', () => {
    expect(isPhotoFreshEnough(now - 60_000, now)).toBe(true);
  });

  it('rejects a photo taken before the window', () => {
    expect(isPhotoFreshEnough(now - PHOTO_FRESHNESS_WINDOW_MS - 1, now)).toBe(false);
  });

  it('accepts a photo taken exactly at the window edge', () => {
    expect(isPhotoFreshEnough(now - PHOTO_FRESHNESS_WINDOW_MS, now)).toBe(true);
  });

  it('rejects a photo with no capture time, since staleness cannot be ruled out', () => {
    expect(isPhotoFreshEnough(null, now)).toBe(false);
  });

  it('tolerates mild camera clock skew into the future', () => {
    expect(isPhotoFreshEnough(now + 60_000, now)).toBe(true);
  });

  it('rejects a wildly post-dated capture time', () => {
    expect(isPhotoFreshEnough(now + PHOTO_FRESHNESS_WINDOW_MS + 1, now)).toBe(false);
  });
});

describe('isUsableDeviceLocation', () => {
  it('accepts a tight GPS fix', () => {
    expect(isUsableDeviceLocation({ latitude: 51.5, longitude: -0.12, accuracy: 12 })).toBe(true);
  });

  it('rejects a wifi-derived fix that is too vague to pin', () => {
    expect(isUsableDeviceLocation({ latitude: 51.5, longitude: -0.12, accuracy: 2_500 })).toBe(
      false,
    );
  });

  it('accepts a fix exactly at the accuracy ceiling', () => {
    expect(
      isUsableDeviceLocation({
        latitude: 51.5,
        longitude: -0.12,
        accuracy: DEVICE_LOCATION_MAX_ACCURACY_M,
      }),
    ).toBe(true);
  });

  it('rejects a non-finite accuracy', () => {
    expect(isUsableDeviceLocation({ latitude: 51.5, longitude: -0.12, accuracy: Number.NaN })).toBe(
      false,
    );
  });
});

describe('describeSuggestionOutcome', () => {
  const at = (latitude: number, longitude: number, accuracy: number) =>
    ({ status: 'ok', location: { latitude, longitude, accuracy } }) as const;

  it('distinguishes a missing capture time from a stale photo', () => {
    expect(describeSuggestionOutcome({ takenAt: null, now, device: null })).toBe(
      'no capture time in EXIF',
    );
    expect(
      describeSuggestionOutcome({ takenAt: now - 45 * 60_000, now, device: at(51, 0, 5) }),
    ).toBe('photo 45 min old');
  });

  it('names the geolocation failure so a silent null is diagnosable', () => {
    expect(
      describeSuggestionOutcome({ takenAt: now, now, device: { status: 'failed', code: 1 } }),
    ).toBe('location denied (or insecure origin)');
    expect(
      describeSuggestionOutcome({ takenAt: now, now, device: { status: 'failed', code: 3 } }),
    ).toBe('location timed out');
    expect(
      describeSuggestionOutcome({ takenAt: now, now, device: { status: 'unsupported' } }),
    ).toBe('geolocation unavailable — needs HTTPS');
  });

  it('reports the accuracy that failed the ceiling', () => {
    expect(describeSuggestionOutcome({ takenAt: now, now, device: at(51, 0, 340) })).toBe(
      `accuracy 340 m > ${DEVICE_LOCATION_MAX_ACCURACY_M} m`,
    );
  });

  it('confirms a suggestion with its accuracy', () => {
    expect(describeSuggestionOutcome({ takenAt: now, now, device: at(51, 0, 12) })).toBe(
      'suggested (accuracy 12 m)',
    );
  });
});
